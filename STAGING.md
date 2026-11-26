# The Physio Lab staging site

This branch is the test copy of the site. It is meant to be served at
https://staging.thephysiolab.co.uk, not on the live GitHub Pages site.

The live site stays on `main` at https://thephysiolab.co.uk. Never push
this branch to `main` without a review, and never change the `CNAME`
file (it must stay `thephysiolab.co.uk` on `main`).

## Files that must stay off `main`

- `robots.txt` - disallows all crawlers. If this landed on `main`,
  search engines would drop the live site from their index.
- `STAGING.md` - this note. It is not part of the public site.

`_headers` sets `X-Robots-Tag: noindex, nofollow` for Cloudflare Pages.
GitHub Pages ignores `_headers`, so that file is harmless on `main`,
but it is still only needed on staging.

## How to promote work to the live site

1. Keep feature work in its own commits, separate from the staging
   noindex files (the commit that added `robots.txt`, `_headers` and
   this note).
2. When Ed has tested the change on staging and says to push it live,
   promote by cherry-picking or merging only those feature commits
   onto `main`. Do not merge the whole `staging` branch into `main`.
3. After promoting, rebase or merge `main` back into `staging` so the
   test site stays in step, without removing the noindex files.
4. Leave the live GitHub Pages settings and the apex/www DNS records
   alone.

If a full merge of `staging` into `main` is ever used by mistake,
delete `robots.txt` and `STAGING.md` from `main` before the live
deploy, and check that `CNAME` is still `thephysiolab.co.uk`.
