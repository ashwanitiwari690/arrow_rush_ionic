import { platformBrowser } from '@angular/platform-browser';
import { setAssetPath } from 'ionicons/components';

import { AppModule } from './app/app.module';

// Resolve the packaged /svg icons from the app base, including on nested/native routes.
setAssetPath(document.baseURI);

platformBrowser().bootstrapModule(AppModule)
  .catch(err => console.log(err));
