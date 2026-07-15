import { expect, it } from "vitest";
import { getVolumeBackupRetentionValue } from "@/components/dashboard/application/volume-backups/volume-backup-retention";

it("sends null when volume backup retention is cleared", () => {
	expect(getVolumeBackupRetentionValue(undefined)).toBeNull();
});

it("preserves a configured volume backup retention count", () => {
	expect(getVolumeBackupRetentionValue(5)).toBe(5);
});
