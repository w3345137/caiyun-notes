use std::collections::{HashMap, HashSet};

/// Native map identities are session scoped, never a caller supplied label.
/// Keep an entry until native close succeeds; failed cleanup must not free it.
#[derive(Default)]
pub struct MapSessions {
    owners: HashMap<String, String>,
    retired: HashSet<String>,
    ready: HashSet<String>,
}

impl MapSessions {
    pub fn reserve(&mut self, owner: &str, session: &str) -> Result<String, &'static str> {
        if owner.is_empty()
            || !(16..=128).contains(&session.len())
            || !session
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
        {
            return Err("invalid map identity");
        }
        if self.retired.contains(session) {
            return Err("map session already closed");
        }
        if let Some(existing) = self.owners.get(session) {
            return if existing == owner && self.ready.contains(session) {
                Ok(format!("map-session-{session}"))
            } else if existing == owner {
                Err("map creation in progress")
            } else {
                Err("map session owned by another window")
            };
        }
        self.owners.insert(session.to_owned(), owner.to_owned());
        Ok(format!("map-session-{session}"))
    }

    pub fn resolve(&self, owner: &str, session: &str) -> Result<String, &'static str> {
        match self.owners.get(session) {
            Some(existing) if existing == owner && self.ready.contains(session) => {
                Ok(format!("map-session-{session}"))
            }
            _ => Err("map session unavailable"),
        }
    }

    pub fn created(&mut self, owner: &str, session: &str) -> Result<(), &'static str> {
        if self.owners.get(session).map(String::as_str) != Some(owner) {
            return Err("map session unavailable");
        }
        self.ready.insert(session.to_owned());
        Ok(())
    }

    pub fn creation_failed(&mut self, owner: &str, session: &str) -> Result<(), &'static str> {
        if self.owners.get(session).map(String::as_str) != Some(owner)
            || self.ready.contains(session)
        {
            return Err("map creation not pending");
        }
        self.owners.remove(session);
        self.retired.insert(session.to_owned());
        Ok(())
    }

    pub fn release(&mut self, owner: &str, session: &str) -> Result<(), &'static str> {
        self.resolve(owner, session)?;
        self.owners.remove(session);
        self.ready.remove(session);
        self.retired.insert(session.to_owned());
        Ok(())
    }

    pub fn accepts_reply(&self, label: &str, session: &str) -> bool {
        self.ready.contains(session) && label == format!("map-session-{session}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn independent_views_cannot_close_or_reply_for_each_other() {
        let mut state = MapSessions::default();
        let a = "map_session_00001";
        let b = "map_session_00002";
        let la = state.reserve("main", a).unwrap();
        let lb = state.reserve("main", b).unwrap();
        state.created("main", a).unwrap();
        state.created("main", b).unwrap();
        assert_ne!(la, lb);
        assert!(state.reserve("other", a).is_err());
        assert!(state.release("other", a).is_err());
        assert!(!state.accepts_reply(&la, b));
        assert!(state.accepts_reply(&lb, b));
        state.release("main", a).unwrap();
        assert!(state.resolve("main", a).is_err());
        assert!(state.release("main", a).is_err());
        assert!(
            state.reserve("main", a).is_err(),
            "closed identity cannot be recycled"
        );
        assert_eq!(state.resolve("main", b).unwrap(), lb);
        assert!(!state.accepts_reply(&la, a));
    }
    #[test]
    fn pending_and_failed_creation_cannot_receive_commands() {
        let mut state = MapSessions::default();
        let session = "map_session_fail";
        let label = state.reserve("main", session).unwrap();
        assert!(state.reserve("main", session).is_err());
        assert!(state.resolve("main", session).is_err());
        assert!(!state.accepts_reply(&label, session));
        assert!(state.creation_failed("other", session).is_err());
        state.creation_failed("main", session).unwrap();
        assert!(state.created("main", session).is_err());
        assert!(state.reserve("main", session).is_err());
    }
    #[test]
    fn malformed_identity_never_becomes_a_native_label() {
        let mut state = MapSessions::default();
        for session in ["", "short", "map/session_0001", "map_session_0001\n"] {
            assert!(state.reserve("main", session).is_err());
        }
        assert!(state.reserve("", "map_session_00001").is_err());
    }
}
