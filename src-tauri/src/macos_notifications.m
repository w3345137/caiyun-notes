#import <Foundation/Foundation.h>
#import <UserNotifications/UserNotifications.h>

typedef void (*CaiyunNotificationResult)(void *, int);

@interface CaiyunNotificationPresenter : NSObject <UNUserNotificationCenterDelegate>
@end

@implementation CaiyunNotificationPresenter
- (void)userNotificationCenter:(UNUserNotificationCenter *)center
       willPresentNotification:(UNNotification *)notification
         withCompletionHandler:(void (^)(UNNotificationPresentationOptions))completion {
    if (@available(macOS 11.0, *)) {
        completion(UNNotificationPresentationOptionBanner | UNNotificationPresentationOptionList | UNNotificationPresentationOptionSound);
    } else {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
        completion(UNNotificationPresentationOptionAlert | UNNotificationPresentationOptionSound);
#pragma clang diagnostic pop
    }
}
@end

void caiyun_macos_notification_status(void *context, CaiyunNotificationResult result) {
    dispatch_async(dispatch_get_main_queue(), ^{
        [UNUserNotificationCenter.currentNotificationCenter getNotificationSettingsWithCompletionHandler:^(UNNotificationSettings *settings) {
            result(context, (int)settings.authorizationStatus);
        }];
    });
}

void caiyun_macos_notification_request(void *context, CaiyunNotificationResult result) {
    dispatch_async(dispatch_get_main_queue(), ^{
        UNUserNotificationCenter *center = UNUserNotificationCenter.currentNotificationCenter;
        [center requestAuthorizationWithOptions:(UNAuthorizationOptionAlert | UNAuthorizationOptionSound)
                              completionHandler:^(BOOL granted, NSError *error) {
            (void)granted;
            if (error) {
                result(context, -1);
                return;
            }
            [center getNotificationSettingsWithCompletionHandler:^(UNNotificationSettings *settings) {
                result(context, (int)settings.authorizationStatus);
            }];
        }];
    });
}

void caiyun_macos_notification_send(const char *title, const char *body, void *context, CaiyunNotificationResult result) {
    NSString *notificationTitle = [NSString stringWithUTF8String:title];
    NSString *notificationBody = [NSString stringWithUTF8String:body];
    dispatch_async(dispatch_get_main_queue(), ^{
        UNUserNotificationCenter *center = UNUserNotificationCenter.currentNotificationCenter;
        static CaiyunNotificationPresenter *presenter;
        if (!center.delegate) {
            if (!presenter) presenter = [CaiyunNotificationPresenter new];
            center.delegate = presenter;
        }
        UNMutableNotificationContent *content = [UNMutableNotificationContent new];
        content.title = notificationTitle;
        content.body = notificationBody;
        content.sound = UNNotificationSound.defaultSound;
        UNNotificationRequest *request = [UNNotificationRequest requestWithIdentifier:NSUUID.UUID.UUIDString
                                                                             content:content trigger:nil];
        [center addNotificationRequest:request withCompletionHandler:^(NSError *error) {
            result(context, error ? -1 : 2);
        }];
    });
}
