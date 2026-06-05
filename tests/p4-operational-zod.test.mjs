import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

test("P4 operational server actions validate form payloads with Zod schemas", () => {
  const actions = read("src/lib/operational/actions.ts")

  assert.match(actions, /import \{ z \} from "zod"/)
  assert.match(actions, /function validateActionForm/)

  for (const schema of [
    "eventSchema",
    "attendanceSchema",
    "prayerSchema",
    "readingPlanSchema",
    "announcementSchema",
    "notificationSchema",
    "notificationGroupSchema",
    "crmCardSchema",
    "revenueSchema",
    "expenseSchema",
    "financialCategorySchema",
    "costCenterSchema",
    "bankAccountSchema",
    "supplierSchema",
    "donationSchema",
    "donationRecurrenceSchema",
    "subscriptionPlanSchema",
    "subscriptionTagSchema",
    "subscriptionSchema",
    "subscriptionContentSchema",
    "subscriptionCollectionSchema",
  ]) {
    assert.match(actions, new RegExp(`const ${schema} = z\\.object`))
    assert.match(actions, new RegExp(`validateActionForm\\(formData, ${schema}\\)`))
  }

  assert.doesNotMatch(actions, /function requireText/)
})
