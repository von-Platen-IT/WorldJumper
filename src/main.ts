import './ui/styles.css';
import { AppController } from './app/AppController';

const app = new AppController();

app.init().catch((error: unknown) => {
  console.error(error);
  const message = error instanceof Error ? error.message : String(error);
  app.showBootError(
    `Start fehlgeschlagen: ${message}. Läuft „npm run data“ bereits einmal erfolgreich durch?`,
  );
});
