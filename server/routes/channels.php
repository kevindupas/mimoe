<?php

use App\Models\User;
use Illuminate\Support\Facades\Broadcast;

// Per-user private channel: only the account's devices listen to it.
Broadcast::channel('clips.{userId}', function (User $user, int $userId) {
    return (int) $user->id === $userId;
});
