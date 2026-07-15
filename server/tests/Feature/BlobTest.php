<?php

namespace Tests\Feature;

use App\Models\Blob;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BlobTest extends TestCase
{
    use RefreshDatabase;

    private function seedBlob(User $u, array $over = []): Blob
    {
        return Blob::create(array_merge([
            'id' => (string) Str::uuid(),
            'user_id' => $u->id,
            'data' => base64_encode('cipher'),
            'nonce' => 'nonce',
            'expires_at' => now()->addDay(),
        ], $over));
    }

    public function test_store_and_show_own_blob(): void
    {
        $u = User::factory()->create();
        Sanctum::actingAs($u);

        $id = $this->postJson('/api/blob', ['data' => base64_encode('img'), 'nonce' => 'n'])
            ->assertCreated()->json('id');

        $this->getJson("/api/blob/{$id}")
            ->assertOk()
            ->assertJsonStructure(['data', 'nonce']);
    }

    public function test_cannot_read_another_users_blob(): void
    {
        $owner = User::factory()->create();
        $blob = $this->seedBlob($owner);

        Sanctum::actingAs(User::factory()->create());
        $this->getJson("/api/blob/{$blob->id}")->assertNotFound();
    }

    public function test_expired_blob_is_not_returned(): void
    {
        $u = User::factory()->create();
        $blob = $this->seedBlob($u, ['expires_at' => now()->subHour()]);

        Sanctum::actingAs($u);
        $this->getJson("/api/blob/{$blob->id}")->assertNotFound();
    }
}
