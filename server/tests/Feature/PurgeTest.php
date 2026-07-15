<?php

namespace Tests\Feature;

use App\Models\Blob;
use App\Models\Clip;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class PurgeTest extends TestCase
{
    use RefreshDatabase;

    public function test_purge_removes_expired_keeps_fresh(): void
    {
        $u = User::factory()->create();

        $fresh = Clip::create([
            'id' => (string) Str::uuid(), 'user_id' => $u->id, 'kind' => 'text',
            'origin_device_id' => (string) Str::uuid(), 'ciphertext' => 'x', 'nonce' => 'y',
            'is_sensitive' => false, 'created_at' => now(), 'expires_at' => now()->addDay(),
        ]);
        $expired = Clip::create([
            'id' => (string) Str::uuid(), 'user_id' => $u->id, 'kind' => 'text',
            'origin_device_id' => (string) Str::uuid(), 'ciphertext' => 'x', 'nonce' => 'y',
            'is_sensitive' => false, 'created_at' => now()->subDays(2), 'expires_at' => now()->subHour(),
        ]);

        Blob::create(['id' => (string) Str::uuid(), 'user_id' => $u->id, 'data' => 'd', 'nonce' => 'n', 'expires_at' => now()->subHour()]);
        Blob::create(['id' => (string) Str::uuid(), 'user_id' => $u->id, 'data' => 'd', 'nonce' => 'n', 'expires_at' => now()->addDay()]);

        $this->artisan('mimoe:purge')->assertSuccessful();

        $this->assertDatabaseHas('clips', ['id' => $fresh->id]);
        $this->assertDatabaseMissing('clips', ['id' => $expired->id]);
        $this->assertSame(1, Blob::count()); // the fresh one stays
    }
}
