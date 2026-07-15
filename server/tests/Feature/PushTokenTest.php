<?php

namespace Tests\Feature;

use App\Models\Device;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PushTokenTest extends TestCase
{
    use RefreshDatabase;

    private function device(User $u): Device
    {
        return Device::create([
            'id' => (string) Str::uuid(),
            'user_id' => $u->id,
            'name' => 'Pixel',
            'platform' => 'android',
            'paired_at' => now(),
        ]);
    }

    public function test_registers_token_on_own_device(): void
    {
        $u = User::factory()->create();
        $d = $this->device($u);
        Sanctum::actingAs($u);

        $this->postJson('/api/push-token', ['device_id' => $d->id, 'token' => 'fcm-xyz'])
            ->assertOk();
        $this->assertSame('fcm-xyz', $d->fresh()->push_token);
    }

    public function test_unknown_device_returns_404(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $this->postJson('/api/push-token', ['device_id' => (string) Str::uuid(), 'token' => 't'])
            ->assertNotFound();
    }

    public function test_cannot_set_token_on_another_users_device(): void
    {
        $owner = User::factory()->create();
        $device = $this->device($owner);
        $attacker = User::factory()->create();

        Sanctum::actingAs($attacker);
        $this->postJson('/api/push-token', ['device_id' => $device->id, 'token' => 'evil'])
            ->assertNotFound();
        $this->assertNull($device->fresh()->push_token);
    }
}
