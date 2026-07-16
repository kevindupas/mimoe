<?php

namespace App\Http\Controllers;

use App\Models\Blob;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class BlobController extends Controller
{
    /** Upload d'un blob chiffré (image). Retourne son id. */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'data' => ['required', 'string'],   // base64(AES-256-GCM(octets image))
            'nonce' => ['required', 'string'],
        ]);

        $blob = Blob::create([
            'id' => (string) Str::uuid(),
            'user_id' => $request->user()->id,
            'data' => $data['data'],
            'nonce' => $data['nonce'],
            'expires_at' => now()->addHours((int) config('mimoe.ttl_hours', 24)),
        ]);

        return response()->json(['id' => $blob->id], 201);
    }

    /** Récupère un blob chiffré (scopé à l'utilisateur). Le serveur ne déchiffre jamais. */
    public function show(Request $request, string $id): JsonResponse
    {
        $blob = Blob::where('user_id', $request->user()->id)
            ->where('expires_at', '>', now())
            ->findOrFail($id);

        return response()->json(['data' => $blob->data, 'nonce' => $blob->nonce]);
    }
}
