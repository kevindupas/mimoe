<?php

namespace App\Http\Controllers;

use App\Events\ClipReceived;
use App\Models\Clip;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class ClipController extends Controller
{
    /** Historique récent de l'utilisateur (ciphertext + métadonnées). */
    public function index(Request $request): JsonResponse
    {
        $clips = Clip::where('user_id', $request->user()->id)
            ->where(fn ($q) => $q->where('expires_at', '>', now())->orWhere('pinned', true))
            ->orderByDesc('pinned')
            ->orderByDesc('created_at')
            ->limit(config('clipd.max_clips', 100))
            ->get();

        return response()->json(['data' => $clips]);
    }

    /** Ingestion d'un clip chiffré. Le serveur ne calcule rien sur le contenu. */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'id' => ['required', 'uuid'],
            'origin_device_id' => ['required', 'uuid'],
            'kind' => ['sometimes', 'in:text,image,file'],
            'blob_id' => ['nullable', 'uuid'],
            'mime' => ['nullable', 'string', 'max:100'],
            'ciphertext' => ['required', 'string'],
            'nonce' => ['required', 'string'],
            'is_sensitive' => ['sometimes', 'boolean'],
            'created_at' => ['required', 'date'],
        ]);

        $userId = $request->user()->id;

        if ($clip = Clip::where('user_id', $userId)->find($data['id'])) {
            return response()->json(['data' => $clip], 200);
        }

        $clip = Clip::create([
            'id' => $data['id'],
            'user_id' => $userId,
            'kind' => $data['kind'] ?? 'text',
            'blob_id' => $data['blob_id'] ?? null,
            'mime' => $data['mime'] ?? null,
            'origin_device_id' => $data['origin_device_id'],
            'ciphertext' => $data['ciphertext'],
            'nonce' => $data['nonce'],
            'is_sensitive' => $data['is_sensitive'] ?? false,
            'created_at' => Carbon::parse($data['created_at']),
            'expires_at' => now()->addHours((int) config('clipd.ttl_hours', 24)),
        ]);

        $this->enforceMaxClips($userId);

        broadcast(new ClipReceived($clip));

        // Push natif (app tuee) : ne doit JAMAIS casser l'enregistrement du clip.
        try {
            app(\App\Services\PushService::class)->notifyOtherDevices($clip);
        } catch (\Throwable $e) {
            report($e);
        }

        return response()->json(['data' => $clip], 201);
    }

    /** Épingle / désépingle un clip (survit au TTL et au cap). */
    public function pin(Request $request, string $id): JsonResponse
    {
        $data = $request->validate(['pinned' => ['required', 'boolean']]);
        $clip = Clip::where('user_id', $request->user()->id)->find($id);
        if (! $clip) {
            return response()->json(['message' => 'introuvable'], 404);
        }
        $clip->pinned = $data['pinned'];
        $clip->save();

        return response()->json(['data' => $clip]);
    }

    /** Suppression manuelle d'un clip par l'utilisateur (+ son blob) + broadcast live. */
    public function destroy(Request $request, string $id): JsonResponse
    {
        $clip = Clip::where('user_id', $request->user()->id)->find($id);
        if (! $clip) {
            return response()->json(['message' => 'introuvable'], 404);
        }

        $blobId = $clip->blob_id;
        $clip->delete();
        if ($blobId) {
            \App\Models\Blob::where('id', $blobId)->delete();
        }
        broadcast(new \App\Events\ClipsDeleted($request->user()->id, [$id]));

        return response()->json(['ok' => true]);
    }

    /** Cap dur par utilisateur : garde les N clips récents. Supprime le reste
     * (+ leurs blobs) et prévient les clients pour qu'ils retirent ces ids live. */
    protected function enforceMaxClips(int $userId): void
    {
        $max = (int) config('clipd.max_clips', 50);
        // Les clips épinglés sont hors-cap : jamais évincés, ne comptent pas dans le N.
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
