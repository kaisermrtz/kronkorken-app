# kronkorken-app

Kronkorken Datenbank

Ein kleines Übungsprojekt für das ich ein altes Hobby von mir reaktiviert habe.

Das Ergebnis ist hier zu finden: https://floating-beyond-54571.herokuapp.com

## Development

1. For local development add a `server/config/config.json` file like this:

```json
{
  "development": {
    "PORT": 3000,
    "DB_URI": ""
  },
  "test": {
    "PORT": 3000,
    "DB_URI": ""
  }
}
```

2. Run `npm i` to install all npm packages.

3. Run `npm start` to start the server.
