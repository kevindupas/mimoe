<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class Clip extends Model
{
    use HasUuids;

    public $incrementing = false;
    protected $keyType = 'string';
    public $timestamps = false; // created_at fourni client, pas d'updated_at

    protected $fillable = [
        'id',
        'user_id',
        'kind',
        'blob_id',
        'origin_device_id',
        'ciphertext',
        'nonce',
        'is_sensitive',
        'created_at',
        'expires_at',
    ];

    protected $casts = [
        'is_sensitive' => 'boolean',
        'created_at' => 'datetime',
        'expires_at' => 'datetime',
    ];
}
