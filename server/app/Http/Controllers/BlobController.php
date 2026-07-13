<?php

namespace App\Http\Controllers;

use App\Models\Blob;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class BlobController extends Controller
{
    /** Uploads an encrypted blob (image). Returns its id. */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            // Anti-DoS cap aligned with the body limit (~100 MB): covers an image
            // of about 60 MB once base64-encoded, bounds the rest.
            'data' => ['required', 'string', 'max:95000000'], // base64(AES-256-GCM(image bytes))
            'nonce' => ['required', 'string', 'max:64'],
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

    /** Fetches an encrypted blob (scoped to the user). The server never decrypts. */
    public function show(Request $request, string $id): JsonResponse
    {
        $blob = Blob::where('user_id', $request->user()->id)
            ->where('expires_at', '>', now())
            ->findOrFail($id);

        return response()->json(['data' => $blob->data, 'nonce' => $blob->nonce]);
    }
}
