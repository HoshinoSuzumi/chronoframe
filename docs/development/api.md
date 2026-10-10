# API Overview

The API uses the same session authentication as the web app. Authenticated requests carry the cookie obtained at sign-in; dashboard settings and management operations also check administrator privileges.

Common routes are listed below. For full parameters, responses and access rules, consult the routes and Zod validation in `server/api/`. These routes are not a versioned external API contract.

| Method | Path                                        | Purpose                                                                |
| ------ | ------------------------------------------- | ---------------------------------------------------------------------- |
| POST   | `/api/login`                                | Sign in with email/password and set a session cookie                   |
| GET    | `/api/auth/github`                          | GitHub OAuth login and callback                                        |
| GET    | `/api/photos`                               | Photo list for signed-in users                                         |
| GET    | `/api/photos/visible`                       | Public photo list excluding hidden and password-protected album photos |
| GET    | `/api/albums`                               | Read accessible albums                                                 |
| POST   | `/api/albums/:albumId/unlock`               | Unlock an album with its password                                      |
| GET    | `/api/system/settings/fields?namespace=app` | Read setting form fields (administrator)                               |
| PUT    | `/api/system/settings/batch`                | Save settings in a batch (administrator)                               |
| GET    | `/api/queue/recent`                         | Recent dashboard tasks                                                 |
| GET    | `/api/system/logs`                          | Dashboard logs                                                         |

## Update settings in a batch

With an administrator session, send a PUT request to `/api/system/settings/batch`:

```json
{
  "updates": [
    { "namespace": "app", "key": "title", "value": "My Gallery" },
    { "namespace": "app", "key": "slogan", "value": "Photos from my travels" }
  ]
}
```

For new settings or form changes, read [Adding a setting](/development/how-to-add-setting). Photo access follows album visibility and password rules; do not use the authenticated dashboard photo list as a public API.
