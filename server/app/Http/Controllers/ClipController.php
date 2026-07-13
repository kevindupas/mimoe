<?php

namespace App\Http\Controllers;

use App\Events\ClipReceived;
use App\Models\Clip;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class ClipController extends Controller
{
    /** Recent history for the user (ciphertext + metadata). */
    public function index(Request $request): JsonResponse
    {
        $clips = Clip::where('user_id', $request->user()->id)
            ->where(fn ($q) => $q->where('expires_at', '>', now())->orWhere('pinned', true))
            ->orderByDesc('pinned')
            ->orderByDesc('created_at')
            ->limit(config('mimoe.max_clips', 100))
            ->get();

        return response()->json(['data' => $clips]);
    }

    /** Ingests an encrypted clip. The server computes nothing on the content. */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'id' => ['required', 'uuid'],
            'origin_device_id' => ['required', 'uuid'],
            'kind' => ['sometimes', 'in:text,image,file'],
            'blob_id' => ['nullable', 'uuid'],
            'mime' => ['nullable', 'string', 'max:100'],
            'dedup_hash' => ['nullable', 'string', 'max:128'],
            // Anti-DoS caps: an authenticated client must not be able to bloat
            // the database. 12 MB of base64 amply covers a large text copy;
            // images go through /blob, not this field.
            'ciphertext' => ['required', 'string', 'max:12000000'],
            'nonce' => ['required', 'string', 'max:64'],
            'is_sensitive' => ['sometimes', 'boolean'],
            'created_at' => ['required', 'date'],
        ]);

        $userId = $request->user()->id;

        if ($clip = Clip::where('user_id', $userId)->find($data['id'])) {
            return response()->json(['data' => $clip], 200);
        }

        // Dedup by CONTENT, across all devices: the same content copied on
        // several devices (or copied again later) must yield only ONE card.
        // If a live clip carries the same dedup_hash, we bump it up (created_at
        // + expires_at refreshed) and rebroadcast so that all devices move it
        // back to the top, rather than creating a duplicate.
        if (! empty($data['dedup_hash'])) {
            $existing = Clip::where('user_id', $userId)
                ->where('dedup_hash', $data['dedup_hash'])
                ->where(fn ($q) => $q->where('expires_at', '>', now())->orWhere('pinned', true))
                ->latest('created_at')
                ->first();
            if ($existing) {
                $existing->update([
                    'created_at' => now(),
                    'expires_at' => now()->addHours((int) config('mimoe.ttl_hours', 24)),
                ]);
                broadcast(new ClipReceived($existing));
                return response()->json(['data' => $existing], 200);
            }
        }

        $clip = Clip::create([
            'id' => $data['id'],
            'user_id' => $userId,
            'kind' => $data['kind'] ?? 'text',
            'blob_id' => $data['blob_id'] ?? null,
            'mime' => $data['mime'] ?? null,
            'dedup_hash' => $data['dedup_hash'] ?? null,
            'origin_device_id' => $data['origin_device_id'],
            'ciphertext' => $data['ciphertext'],
            'nonce' => $data['nonce'],
            'is_sensitive' => $data['is_sensitive'] ?? false,
            'created_at' => Carbon::parse($data['created_at']),
            'expires_at' => now()->addHours((int) config('mimoe.ttl_hours', 24)),
        ]);

        $this->enforceMaxClips($userId);

        broadcast(new ClipReceived($clip));

        // Native push (app killed): must NEVER break the clip's persistence.
        try {
            app(\App\Services\PushService::class)->notifyOtherDevices($clip);
        } catch (\Throwable $e) {
            report($e);
        }

        return response()->json(['data' => $clip], 201);
    }

    /** Pins / unpins a clip (survives the TTL and the cap). */
    public function pin(Request $request, string $id): JsonResponse
    {
        $data = $request->validate(['pinned' => ['required', 'boolean']]);
        $clip = Clip::where('user_id', $request->user()->id)->find($id);
        if (! $clip) {
            return response()->json(['message' => 'not found'], 404);
        }
        $clip->pinned = $data['pinned'];
        $clip->save();

        return response()->json(['data' => $clip]);
    }

    /** Manual deletion of a clip by the user (+ its blob) + live broadcast. */
    public function destroy(Request $request, string $id): JsonResponse
    {
        $clip = Clip::where('user_id', $request->user()->id)->find($id);
        if (! $clip) {
            return response()->json(['message' => 'not found'], 404);
        }

        $blobId = $clip->blob_id;
        $clip->delete();
        if ($blobId) {
            \App\Models\Blob::where('id', $blobId)->delete();
        }
        broadcast(new \App\Events\ClipsDeleted($request->user()->id, [$id]));

        return response()->json(['ok' => true]);
    }

    /** Hard per-user cap: keeps the N most recent clips. Deletes the rest
     * (+ their blobs) and notifies clients so they remove those ids live. */
    protected function enforceMaxClips(int $userId): void
    {
        $max = (int) config('mimoe.max_clips', 50);
        // Pinned clips are outside the cap: never evicted, not counted in the N.
        $keep = Clip::where('user_id', $userId)
            ->where('pinned', false)
            ->orderByDesc('created_at')
            ->limit($max)
            ->pluck('id');
        $stale = Clip::where('user_id', $userId)
            ->where('pinned', false)
            ->whereNotIn('id', $keep)
            ->get(['id', 'blob_id']);
        if ($stale->isEmpty()) {
            return;
        }
        $ids = $stale->pluck('id')->all();
        $blobIds = $stale->pluck('blob_id')->filter()->all();

        Clip::whereIn('id', $ids)->delete();
        if ($blobIds) {
            \App\Models\Blob::whereIn('id', $blobIds)->delete();
        }
        broadcast(new \App\Events\ClipsDeleted($userId, $ids));
    }
}
