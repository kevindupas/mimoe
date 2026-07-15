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
        config(['mimoe.registration_enabled' => false]);
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
        // updateOrCreate: no duplicate device
        $this->assertSame(1, Device::where('id', $deviceId)->count());
    }

    public function test_login_is_rate_limited(): void
    {
        for ($i = 0; $i < 6; $i++) {
            $this->postJson('/api/login', $this->payload(['password' => 'nope123456']))->assertStatus(422);
        }
        $this->postJson('/api/login', $this->payload(['password' => 'nope123456']))->assertStatus(429);
    }

    public function test_server_info_reports_registration_open(): void
    {
        config(['mimoe.registration_enabled' => true]);

        $this->getJson('/api/server-info')
            ->assertOk()
            ->assertExactJson(['registration_enabled' => true]);
    }

    public function test_server_info_reports_registration_closed(): void
    {
        config(['mimoe.registration_enabled' => false]);

        $this->getJson('/api/server-info')
            ->assertOk()
            ->assertExactJson(['registration_enabled' => false]);
    }

    public function test_server_info_needs_no_authentication(): void
    {
        // The client calls it before having any account: a 401 here would make
        // the information unreachable at the very moment it is needed.
        $this->getJson('/api/server-info')->assertOk();
    }

    public function test_delete_account_requires_authentication(): void
    {
        $this->deleteJson('/api/account')->assertUnauthorized();
    }

    public function test_delete_account_purges_all_user_data(): void
    {
        $user = User::factory()->create();
        \Laravel\Sanctum\Sanctum::actingAs($user);

        // Data attached to the account.
        \App\Models\Device::create([
            'id' => (string) Str::uuid(), 'user_id' => $user->id,
            'name' => 'Pixel', 'platform' => 'android', 'paired_at' => now(),
            'push_token' => 'fcm-xyz',
        ]);
        \App\Models\Clip::create([
            'id' => (string) Str::uuid(), 'user_id' => $user->id, 'kind' => 'text',
            'origin_device_id' => (string) Str::uuid(), 'ciphertext' => 'x', 'nonce' => 'y',
            'created_at' => now(), 'expires_at' => now()->addDay(),
        ]);
        $user->createToken('device')->plainTextToken;

        $this->deleteJson('/api/account')->assertOk();

        // Account, data and tokens are gone.
        $this->assertDatabaseMissing('users', ['id' => $user->id]);
        $this->assertSame(0, \App\Models\Clip::where('user_id', $user->id)->count());
        $this->assertSame(0, \App\Models\Device::where('user_id', $user->id)->count());
        $this->assertSame(0, \DB::table('personal_access_tokens')
            ->where('tokenable_id', $user->id)->count());
    }

    public function test_delete_account_is_scoped_to_caller(): void
    {
        $victim = User::factory()->create();
        $victimClip = \App\Models\Clip::create([
            'id' => (string) Str::uuid(), 'user_id' => $victim->id, 'kind' => 'text',
            'origin_device_id' => (string) Str::uuid(), 'ciphertext' => 'x', 'nonce' => 'y',
            'created_at' => now(), 'expires_at' => now()->addDay(),
        ]);

        $attacker = User::factory()->create();
        \Laravel\Sanctum\Sanctum::actingAs($attacker);
        $this->deleteJson('/api/account')->assertOk();

        // The deletion touches ONLY the caller: the victim is untouched.
        $this->assertDatabaseHas('users', ['id' => $victim->id]);
        $this->assertDatabaseHas('clips', ['id' => $victimClip->id]);
    }
}
