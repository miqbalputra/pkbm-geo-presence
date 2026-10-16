<?php
declare(strict_types=1);

use PHPUnit\Framework\TestCase;

final class AttendanceLocationPolicyTest extends TestCase
{
    private array $settings = [
        'mode_testing' => '0',
        'sekolah_latitude' => '-5.1477000',
        'sekolah_longitude' => '119.4327000',
        'radius_gps' => '50',
        'max_gps_accuracy_meters' => '50',
    ];

    public function testInsideLocationIsAcceptedWithDistanceAudit(): void
    {
        $result = gp_assess_attendance_location($this->settings, [], -5.14770, 119.43270, '2026-08-29', false, 12);

        self::assertTrue($result['inside']);
        self::assertSame('inside', $result['verdict']);
        self::assertEquals(0.0, $result['distance']);
    }

    public function testOutsideLocationIsMarkedOutside(): void
    {
        $result = gp_assess_attendance_location($this->settings, [], -5.15000, 119.43270, '2026-08-29');

        self::assertFalse($result['inside']);
        self::assertSame('outside', $result['verdict']);
        self::assertGreaterThan(50, $result['distance']);
    }

    public function testPoorGpsAccuracyIsRejected(): void
    {
        $result = gp_assess_attendance_location($this->settings, [], -5.14770, 119.43270, '2026-08-29', false, 51);

        self::assertFalse($result['inside']);
        self::assertStringContainsString('Akurasi GPS', $result['label']);
    }
}
