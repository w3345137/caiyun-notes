// Direct-download channel: route a plain launch to a registered migration-capable
// Store build. No file operations, install, registry edits, or tray shutdown.
#define WIN32_LEAN_AND_MEAN
#define COBJMACROS
#include <windows.h>
#include <appmodel.h>
#include <shobjidl.h>
#include <stdlib.h>
#include <wchar.h>

static const wchar_t family[] = L"BinApp.547813EA77836_hex6nfb75njyr";
static const wchar_t app_id[] = L"BinApp.547813EA77836_hex6nfb75njyr!CaiyunNotes";

static BOOL supported_package(const wchar_t *name) {
    UINT32 size = 0;
    if (PackageIdFromFullName(name, 0, &size, NULL) != ERROR_INSUFFICIENT_BUFFER) return FALSE;
    PACKAGE_ID *id = malloc(size);
    if (!id) return FALSE;
    PACKAGE_VERSION minimum = {0};
    minimum.Major = DIRECT_VERSION_MAJOR;
    minimum.Minor = DIRECT_VERSION_MINOR;
    minimum.Build = DIRECT_VERSION_PATCH;
    BOOL supported = PackageIdFromFullName(name, 0, &size, (BYTE *)id) == ERROR_SUCCESS
        && id->processorArchitecture == PROCESSOR_ARCHITECTURE_AMD64
        && (!id->resourceId || !id->resourceId[0]) && id->version.Version >= minimum.Version;
    free(id);
    return supported;
}

static BOOL has_target(void) {
    UINT32 count = 0, length = 0;
    if (GetPackagesByPackageFamily(family, &count, NULL, &length, NULL) != ERROR_INSUFFICIENT_BUFFER)
        return FALSE;
    PWSTR *names = calloc(count, sizeof(*names));
    PWSTR buffer = calloc(length, sizeof(*buffer));
    BOOL supported = FALSE;
    if (names && buffer && GetPackagesByPackageFamily(family, &count, names, &length, buffer) == ERROR_SUCCESS) {
        for (UINT32 i = 0; i < count && !supported; ++i) supported = supported_package(names[i]);
    }
    free(buffer);
    free(names);
    return supported;
}

static BOOL is_store_process(DWORD pid) {
    HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
    if (!process) return FALSE;
    wchar_t value[ARRAYSIZE(app_id)];
    UINT32 length = ARRAYSIZE(value);
    BOOL matches = GetApplicationUserModelId(process, &length, value) == ERROR_SUCCESS &&
        wcscmp(value, app_id) == 0;
    CloseHandle(process);
    return matches;
}

// Activation can briefly return a secondary PID that passes the launch on.
// Accept either its visible window or the original Store instance's window.
struct launch_observation { DWORD activated; DWORD existing; BOOL visible; };
static BOOL CALLBACK find_visible_window(HWND window, LPARAM data) {
    struct launch_observation *obs = (struct launch_observation *)data;
    DWORD owner = 0;
    GetWindowThreadProcessId(window, &owner);
    if (owner && (owner == obs->activated || owner == obs->existing) && IsWindowVisible(window)
        && !(GetWindowLongPtrW(window, GWL_EXSTYLE) & WS_EX_TOOLWINDOW) && is_store_process(owner)) {
        obs->visible = TRUE;
        return FALSE;
    }
    return TRUE;
}

int caiyun_open_installed_store(void) {
    UINT32 own_package_length = 0;
    if (GetCurrentPackageFullName(&own_package_length, NULL) != APPMODEL_ERROR_NO_PACKAGE || !has_target())
        return 0;
    HRESULT hr = CoInitializeEx(NULL, COINIT_APARTMENTTHREADED);
    if (FAILED(hr)) return 0;
    IApplicationActivationManager *manager = NULL;
    struct launch_observation obs = {0};
    hr = CoCreateInstance(&CLSID_ApplicationActivationManager, NULL, CLSCTX_LOCAL_SERVER,
        &IID_IApplicationActivationManager, (void **)&manager);
    if (SUCCEEDED(hr)) {
        hr = IApplicationActivationManager_ActivateApplication(manager, app_id, NULL, AO_NOERRORUI, &obs.activated);
        IApplicationActivationManager_Release(manager);
    }
    CoUninitialize();
    if (FAILED(hr)) return 0;
    for (int attempt = 0; attempt < 80; ++attempt) {
        HWND listener = FindWindowW(L"com.caiyun.notes-sic", L"com.caiyun.notes-siw");
        obs.existing = 0;
        if (listener) GetWindowThreadProcessId(listener, &obs.existing);
        EnumWindows(find_visible_window, (LPARAM)&obs);
        if (obs.visible) return 1;
        Sleep(100);
    }
    return 0;
}
