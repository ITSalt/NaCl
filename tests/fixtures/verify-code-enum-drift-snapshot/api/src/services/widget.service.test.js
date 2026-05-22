import { test } from "node:test";
import { strict as assert } from "node:assert";
import { archiveWidget, isArchived } from "./widget.service.js";
import { WidgetStatus } from "../../../shared/src/enums.js";

test("archiveWidget transitions ACTIVE → ARCHIVED", () => {
  assert.equal(archiveWidget(WidgetStatus.ACTIVE), WidgetStatus.ARCHIVED);
});

test("archiveWidget refuses to archive a DELETED widget", () => {
  assert.throws(() => archiveWidget(WidgetStatus.DELETED), /deleted/);
});

test("isArchived reports the canonical ARCHIVED value", () => {
  assert.equal(isArchived(WidgetStatus.ARCHIVED), true);
  assert.equal(isArchived(WidgetStatus.ACTIVE), false);
});
