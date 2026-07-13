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
            ->where('expires_at', '>', now())
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
            'kind' => ['sometimes', 'in:text,image'],
            'blob_id' => ['nullable', 'uuid'],
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
        $keep = Clip::where('user_id', $userId)->orderByDesc('created_at')->limit($max)->pluck('id');
        $stale = Clip::where('user_id', $userId)->whereNotIn('id', $keep)->get(['id', 'blob_id']);
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
