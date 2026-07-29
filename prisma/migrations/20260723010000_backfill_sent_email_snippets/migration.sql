UPDATE "emails" AS e
SET "snippet" = LEFT(
  BTRIM(
    REGEXP_REPLACE(
      CASE
        WHEN NULLIF(BTRIM(b."body_text"), '') IS NOT NULL THEN b."body_text"
        ELSE REPLACE(
          REPLACE(
            REPLACE(
              REPLACE(
                REPLACE(
                  REPLACE(
                    REGEXP_REPLACE(
                      REGEXP_REPLACE(
                        REGEXP_REPLACE(
                          COALESCE(b."body_html", ''),
                          '<script[^>]*>.*?</script>',
                          ' ',
                          'gis'
                        ),
                        '<style[^>]*>.*?</style>',
                        ' ',
                        'gis'
                      ),
                      '<[^>]+>',
                      ' ',
                      'g'
                    ),
                    '&nbsp;',
                    ' '
                  ),
                  '&amp;',
                  '&'
                ),
                '&lt;',
                '<'
              ),
              '&gt;',
              '>'
            ),
            '&quot;',
            '"'
          ),
          '&#39;',
          ''''
        )
      END,
      '\s+',
      ' ',
      'g'
    )
  ),
  300
)
FROM "email_bodies" AS b
WHERE
  b."email_id" = e."id"
  AND e."folder" = 'SENT'
  AND (e."snippet" IS NULL OR BTRIM(e."snippet") = '');
