<?php
declare(strict_types=1);

use PHPUnit\Framework\TestCase;

final class WorkdaySnapshotTest extends TestCase
{
    public function testSnapshotAppliesWeekendOverrideAndAccountStartDate(): void
    {
        $snapshot = [
            'dates' => ['2026-08-29', '2026-08-30'], // Saturday, Sunday
            'holidays' => [],
            'optional_workdays' => [],
            'overrides' => [7 => ['2026-08-29' => 1]],
            'weekend_settings' => [],
            'workday_days' => [6],
        ];

        self::assertSame(['2026-08-29'], gpw_get_workdays_from_snapshot($snapshot, [
            'id' => 7,
            'jenis_kelamin' => 'Laki-laki',
            'created_at' => '2026-08-01 00:00:00',
        ]));
    }

    public function testSnapshotExcludesDatesBeforeAccountCreation(): void
    {
        $snapshot = [
            'dates' => ['2026-08-22', '2026-08-29'],
            'holidays' => [],
            'optional_workdays' => [],
            'overrides' => [],
            'weekend_settings' => [],
            'workday_days' => [6],
        ];

        self::assertSame(['2026-08-29'], gpw_get_workdays_from_snapshot($snapshot, [
            'id' => 8,
            'created_at' => '2026-08-25 08:00:00',
        ]));
    }
}
