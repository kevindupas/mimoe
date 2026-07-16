<?php

namespace Tests\Feature;

use App\Models\Device;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    private function payload(array $over = []): array
    {
        return array_merge([
            'email' => 'a@b.com',
            'password' => 'password123',
            'device_id' => (string) Str::uuid(),
            'device_name' => 'Pixel',
            'platform' => 'android',
        ], $over);
    }

    public function test_register_creates_user_device_and_returns_token(): void
    {
        $res = $this->postJson('/api/register', $this->payload());

        $res->assertOk()
            ->assertJsonStructure(['token', 'user_id', 'reverb_app_key', 'reverb_host', 'reverb_port', 'reverb_scheme']);
        $this->assertDatabaseCount('users', 1);
        $this->assertDatabaseCount('devices', 1);
    }

    public function test_register_blocked_when_registration_disabled(): void
    {
        config(['clipd.registration_enabled' => false]);
        $this->postJson('/api/register', $this->payload())->assertStatus(403);
        $this->assertDatabaseCount('users', 0);
    }

    public function test_register_rejects_duplicate_email(): void
    {
        User::factory()->create(['email' => 'a@b.com']);
        $this->postJson('/api/register', $this->payload())->assertStatus(422);
    }

    public function test_register_validates_input(): void
    {
        $this->postJson('/api/register', $this->payload(['password' => 'short']))->assertStatus(422);
        $this->postJson('/api/register', $this->payload(['platform' => 'bsd']))->assertStatus(422);
        $this->postJson('/api/register', $this->payload(['device_id' => 'not-a-uuid']))->assertStatus(422);
    }

    public function test_login_ok_with_valid_credentials(): void
    {
        $this->postJson('/api/register', $this->payload());
        $res = $this->postJson('/api/login', $this->payload(['device_id' => (string) Str::uuid()]));
        $res->assertOk()->assertJsonStructure(['token', 'user_id']);
    }

    public function test_login_rejects_bad_credentials(): void
    {
        $this->postJson('/api/register', $this->payload());
        $this->postJson('/api/login', $this->payload(['password' => 'wrongpass1']))->assertStatus(422);
    }

    public function test_login_reuses_same_device_row(): void
    {
        $deviceId = (string) Str::uuid();
        $this->postJson('/api/register', $this->payload(['device_id' => $deviceId]));
        $this->postJson('/api/login', $this->payload(['device_id' => $deviceId]));
        // updateOrCreate : pas de doublon d'appareil
        $this->assertSame(1, Device::where('id', $deviceId)->count());
    }

    public function test_login_is_rate_limited(): void
    {
        for ($i = 0; $i < 6; $i++) {
            $this->postJson('/api/login', $this->payload(['password' => 'nope123456']))->assertStatus(422);
        }
        $this->postJson('/api/login', $this->payload(['password' => 'nope123456']))->assertStatus(429);
    }
}
