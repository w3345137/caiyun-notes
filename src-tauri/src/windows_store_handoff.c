// Before WebView2 startup, wait for a known historical per-user installation to exit.
// The legacy client owns its unsaved data and its normal tray Quit action.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <commctrl.h>
#include <shlobj.h>
#include <strsafe.h>
#include <wchar.h>

static const wchar_t title[] = L"彩云笔记 · 等待旧版退出";
static const wchar_t instructions[] =
    L"请先保存旧版中的工作，再右键点击任务栏通知区域的彩云笔记图标，选择“退出”。"
    L"旧版退出后，商店版会自动打开。";

// Only inspect the owner of this product's Tauri single-instance window.
// No process enumeration or write/termination rights are needed.
static HANDLE legacy_instance(void) {
    HWND target = FindWindowW(L"com.caiyun.notes-sic", L"com.caiyun.notes-siw");
    DWORD pid = 0;
    if (!target || !GetWindowThreadProcessId(target, &pid)) return NULL;
    HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE, FALSE, pid);
    if (!process) return NULL;
    wchar_t expected[MAX_PATH], path[32768];
    DWORD length = ARRAYSIZE(path);
    if (SUCCEEDED(SHGetFolderPathW(NULL, CSIDL_LOCAL_APPDATA, NULL, SHGFP_TYPE_CURRENT, expected))
        && SUCCEEDED(StringCchCatW(expected, ARRAYSIZE(expected), L"\\彩云笔记\\app.exe"))
        && QueryFullProcessImageNameW(process, 0, path, &length)
        && CompareStringOrdinal(path, -1, expected, -1, TRUE) == CSTR_EQUAL
        && WaitForSingleObject(process, 0) == WAIT_TIMEOUT) return process;
    CloseHandle(process);
    return NULL;
}

static HRESULT CALLBACK check_exit(HWND window, UINT notification, WPARAM w, LPARAM l, LONG_PTR context) {
    (void)w;
    (void)l;
    if (notification == TDN_TIMER && WaitForSingleObject((HANDLE)context, 0) == WAIT_OBJECT_0) {
        PostMessageW(window, TDM_CLICK_BUTTON, IDCANCEL, 0);
    }
    return S_OK;
}

int caiyun_store_can_start(void) {
    HANDLE process = legacy_instance();
    if (!process) return 1;
    HANDLE waiter = CreateMutexW(NULL, FALSE, L"Local\\com.caiyun.notes.store-launch-wait");
    if (!waiter || GetLastError() == ERROR_ALREADY_EXISTS) {
        if (waiter) CloseHandle(waiter);
        CloseHandle(process);
        return 0;
    }

    TASKDIALOGCONFIG dialog = {0};
    dialog.cbSize = sizeof(dialog);
    dialog.dwFlags = TDF_CALLBACK_TIMER | TDF_ALLOW_DIALOG_CANCELLATION;
    dialog.dwCommonButtons = TDCBF_CANCEL_BUTTON;
    dialog.pszWindowTitle = title;
    dialog.pszMainInstruction = L"旧版彩云笔记仍在运行";
    dialog.pszContent = instructions;
    dialog.pfCallback = check_exit;
    dialog.lpCallbackData = (LONG_PTR)process;
    // Resolve dynamically: older common-controls implementations may not export this function.
    HMODULE controls = LoadLibraryExW(L"comctl32.dll", NULL, LOAD_LIBRARY_SEARCH_SYSTEM32);
    typedef HRESULT (WINAPI *ShowTaskDialog)(const TASKDIALOGCONFIG *, int *, int *, BOOL *);
    ShowTaskDialog show = NULL;
    if (controls) {
        FARPROC address = GetProcAddress(controls, "TaskDialogIndirect");
        memcpy(&show, &address, sizeof(show));
    }
    HRESULT status = show ? show(&dialog, NULL, NULL, NULL) : E_NOTIMPL;
    if (controls) FreeLibrary(controls);
    if (FAILED(status)) {
        while (WaitForSingleObject(process, 0) == WAIT_TIMEOUT &&
            MessageBoxW(NULL, L"请保存工作并从通知区域退出旧版彩云笔记，然后选择“重试”。",
                title, MB_RETRYCANCEL | MB_ICONINFORMATION) == IDRETRY) {}
    }
    int exited = WaitForSingleObject(process, 0) == WAIT_OBJECT_0;
    CloseHandle(process);
    CloseHandle(waiter);
    return exited;
}
