#ifndef _KERNEL_SHELL_H
#define _KERNEL_SHELL_H

void shell_thread(void *arg);
int  shell_run_line(char *line);    /* also used by the self-test harness */

#endif
