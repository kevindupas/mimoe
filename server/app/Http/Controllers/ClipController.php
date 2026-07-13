<?php

namespace App\Http\Controllers;

use App\Events\ClipReceived;
use App\Models\Clip;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class ClipController extends Controller
{
    /**
     * Historique recent (ciphertext + metadonnees). Sert au demarrage de l'app
     * pour recharger l'historique. Le serveur ne dechiffre jamais.
     */
    public function index(): JsonResponse
    {
        $clips = Clip::where('expires_at', '>', now())
            ->orderByDesc('created_at')
            ->limit(config('clipd.max_clips', 100))
            ->get();

        return response()->json(['data' => $clips]);
    }

    /**
     * Ingestion d'un clip chiffre. Le serveur valide le format, fixe expires_at,
     * stocke le ciphertext opaque, applique le cap, puis broadcast via Reverb.
     * Il ne calcule RIEN sur le contenu (impossible, c'est chiffre).
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'id' => ['required', 'uuid'],
            'origin_device_id' => ['required', 'uuid'],
            'ciphertext' => ['required', 'string'],
            'nonce' => ['required', 'string'],
            'is_sensitive' => ['sometimes', 'boolean'],
            'created_at' => ['required', 'date'],
        ]);

        // Idempotence : id genere client, on ignore un doublon (retry reseau).
        if ($clip = Clip::find($data['id'])) {
            return response()->json(['data' => $clip], 200);
        }

        $ttlHours = (int) config('clipd.ttl_hours', 24);

        $clip = Clip::create([
            'id' => $data['id'],
            'origin_device_id' => $data['origin_device_id'],
            'ciphertext' => $data['ciphertext'],
            'nonce' => $data['nonce'],
            'is_sensitive' => $data['is_sensitive'] ?? false,
            'created_at' => Carbon::parse($data['created_at']),
            'expires_at' => now()->addHours($ttlHours),
        ]);

        $this->enforceMaxClips();

        broadcast(new ClipReceived($clip));

        return response()->json(['data' => $clip], 201);
    }

    /**
     * Cap dur : ne garde que les N clips les plus recents (TTL "ou 100 clips").
     */
    protected function enforceMaxClips(): void
    {
        $max = (int) config('clipd.max_clips', 100);

        $keepIds = Clip::orderByDesc('created_at')->limit($max)->pluck('id');

        Clip::whereNotIn('id', $keepIds)->delete();
    }
}
