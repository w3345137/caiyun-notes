#include <stdio.h>
int caiyun_open_installed_store(void);
int main(void) {
    puts(caiyun_open_installed_store() ? "STORE" : "DIRECT");
    return 0;
}
