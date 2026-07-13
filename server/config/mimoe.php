<?php

return [
    // TTL des clips : expiration auto apres N heures.
    'ttl_hours' => (int) env('MIMOE_TTL_HOURS', 24),

    // Cap dur : nombre max de clips conserves (le premier atteint entre TTL et cap gagne).
    'max_clips' => (int) env('MIMOE_MAX_CLIPS', 50),

    // Registration open? Set MIMOE_REGISTRATION_ENABLED=false on a private
    // instance (personal self-hosted) to prevent strangers from creating an account.
    'registration_enabled' => filter_var(env('MIMOE_REGISTRATION_ENABLED', true), FILTER_VALIDATE_BOOL),
];
