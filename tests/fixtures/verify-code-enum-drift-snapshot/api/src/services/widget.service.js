import { WidgetStatus } from "../../../shared/src/enums.js";

export function archiveWidget(currentStatus) {
  if (currentStatus === WidgetStatus.DELETED) {
    throw new Error("Cannot archive a deleted widget");
  }
  return WidgetStatus.ARCHIVED;
}

export function isArchived(status) {
  return status === WidgetStatus.ARCHIVED;
}
