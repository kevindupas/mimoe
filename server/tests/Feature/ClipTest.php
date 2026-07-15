<?php

namespace Tests\Feature;

use App\Models\Clip;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ClipTest extends TestCase
{
    use RefreshDatabase;

    private function clip(array $over = []): array
    {
        return array_merge([
            'id' => (string) Str::uuid(),
            'origin_device_id' => (string) Str::uuid(),
            'kind' => 'text',
            'ciphertext' => base64_encode('secret'),
            'nonce' => base64_encode('123456789012'),
            'is_sensitive' => false,
            'created_at' => now()->toIso8601String(),
        ], $over);
    }

    private function seedClip(User $u, array $over = []): Clip
    {
        return Clip::create(array_merge([
            'id' => (string) Str::uuid(),
            'user_id' => $u->id,
            'kind' => 'text',
            'origin_device_id' => (string) Str::uuid(),
            'ciphertext' => 'x',
            'nonce' => 'y',
            'is_sensitive' => false,
            'created_at' => now(),
            'expires_at' => now()->addDay(),
        ], $over));
    }

    public function test_requires_authentication(): void
    {
        $this->postJson('/api/clip', $this->clip())->assertUnauthorized();
        $this->getJson('/api/clips')->assertUnauthorized();
    }

    public function test_store_creates_clip_scoped_to_user(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/clip', $this->clip())->assertCreated();
        $this->assertDatabaseCount('clips', 1);
        $this->assertSame($user->id, Clip::first()->user_id);
    }

    public function test_store_persists_and_returns_mime_for_images(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $payload = $this->clip([
            'kind' => 'image',
            'blob_id' => (string) Str::uuid(),
            'mime' => 'image/gif',
        ]);
        $this->postJson('/api/clip', $payload)->assertCreated()->assertJsonPath('data.mime', 'image/gif');

        $this->assertSame('image/gif', Clip::first()->mime);
        $this->assertSame('image/gif', $this->getJson('/api/clips')->json('data.0.mime'));
    }

    public function test_store_is_idempotent_on_same_id(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $p = $this->clip();

        $this->postJson('/api/clip', $p)->assertCreated();
        $this->postJson('/api/clip', $p)->assertOk(); // 200, pas de doublon
        $this->assertDatabaseCount('clips', 1);
    }

    public function test_index_only_returns_own_clips(): void
    {
        $a = User::factory()->create();
        $b = User::factory()->create();
        $this->seedClip($a);
        $this->seedClip($a);
        $this->seedClip($b);

        Sanctum::actingAs($a);
        $res = $this->getJson('/api/clips');
        $res->assertOk();
        $this->assertCount(2, $res->json('data'));
    }

    public function test_index_excludes_expired_clips(): void
    {
        $u = User::factory()->create();
        $this->seedClip($u, ['expires_at' => now()->subHour()]); // expiré
        $this->seedClip($u);

        Sanctum::actingAs($u);
        $this->assertCount(1, $this->getJson('/api/clips')->json('data'));
    }

    public function test_user_can_delete_own_clip(): void
    {
        $u = User::factory()->create();
        $clip = $this->seedClip($u);
        Sanctum::actingAs($u);

        $this->deleteJson("/api/clip/{$clip->id}")->assertOk();
        $this->assertDatabaseMissing('clips', ['id' => $clip->id]);
    }

    public function test_cannot_delete_another_users_clip(): void
    {
        $owner = User::factory()->create();
        $clip = $this->seedClip($owner);

        Sanctum::actingAs(User::factory()->create());
        $this->deleteJson("/api/clip/{$clip->id}")->assertNotFound();
        $this->assertDatabaseHas('clips', ['id' => $clip->id]);
    }

    public function test_enforces_max_clips_cap(): void
    {
        config(['clipd.max_clips' => 50]);
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $firstId = null;
        for ($i = 0; $i < 52; $i++) {
            $p = $this->clip(['created_at' => now()->addSeconds($i)->toIso8601String()]);
            if ($i === 0) {
                $firstId = $p['id'];
            }
            $this->postJson('/api/clip', $p)->assertSuccessful();
        }

        $this->assertSame(50, Clip::where('user_id', $user->id)->count());
        $this->assertDatabaseMissing('clips', ['id' => $firstId]); // le plus vieux évincé
    }
}
