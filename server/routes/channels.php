<?php

use App\Models\User;
use Illuminate\Support\Facades\Broadcast;

// Canal privé par utilisateur : seuls les appareils du compte l'écoutent.
Broadcast::channel('clips.{userId}', function (User $user, int $userId) {
    return (int) $user->id === $userId;
});
