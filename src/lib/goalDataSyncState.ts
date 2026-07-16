let applyingRemote = false

export function setApplyingRemoteGoalData(value: boolean): void {
  applyingRemote = value
}

export function isApplyingRemoteGoalData(): boolean {
  return applyingRemote
}
