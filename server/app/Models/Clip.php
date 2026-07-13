<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class Clip extends Model
{
    use HasUuids;

    public $incrementing = false;
    protected $keyType = 'string';
    public $timestamps = false; // created_at provided by client, no updated_at

    protected $fillable = [
        'id',
        'user_id',
        'kind',
        'blob_id',
        'mime',
        'dedup_hash',
        'pinned',
        'origin_device_id',
        'ciphertext',
        'nonce',
        'is_sensitive',
        'created_at',
        'expires_at',
    ];

    protected $casts = [
        'is_sensitive' => 'boolean',
        'pinned' => 'boolean',
        'created_at' => 'datetime',
        'expires_at' => 'datetime',
    ];
}
