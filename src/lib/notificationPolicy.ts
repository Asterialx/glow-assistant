export function shouldNotifyReply(enabled: boolean, permission: string, hidden: boolean, status: string): boolean {
  return enabled && permission === "granted" && hidden && status === "done";
}
