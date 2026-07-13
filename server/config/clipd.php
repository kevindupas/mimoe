<?php

return [
    // TTL des clips : expiration auto apres N heures.
    'ttl_hours' => (int) env('CLIPD_TTL_HOURS', 24),

    // Cap dur : nombre max de clips conserves (le premier atteint entre TTL et cap gagne).
    'max_clips' => (int) env('CLIPD_MAX_CLIPS', 100),
];
