/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Datastore, newDatastore } from '../../../src/remote/datastore';
import { newConnection } from '../../../src/platform/connection';
import { newSerializer } from '../../../src/platform/serializer';
import { Firestore } from './database';
import { DatabaseInfo } from '../../../src/core/database_info';
import { logDebug } from '../../../src/util/log';

export const LOG_TAG = 'ComponentProvider';

// settings() defaults:
export const DEFAULT_HOST = 'firestore.googleapis.com';
export const DEFAULT_SSL = true;

// The components module manages the lifetime of dependencies of the Firestore
// client. Dependencies can be lazily constructed and only one exists per
// Firestore instance.

/**
 * An instance map that ensures only one Datastore exists per Firestore
 * instance.
 */
const datastoreInstances = new Map<Firestore, Promise<Datastore>>();

/**
 * Returns an initialized and started Datastore for the given Firestore
 * instance. Callers must invoke removeDatastore() when the Firestore
 * instance is terminated.
 */
export function getDatastore(firestore: Firestore): Promise<Datastore> {
  if (!datastoreInstances.has(firestore)) {
    logDebug(LOG_TAG, 'Initializing Datastore');
    const settings = firestore._getSettings();
    const databaseInfo = new DatabaseInfo(
      firestore._databaseId,
      firestore._persistenceKey,
      settings.host ?? DEFAULT_HOST,
      settings.ssl ?? DEFAULT_SSL,
      /* forceLongPolling= */ false
    );
    const datastorePromise = newConnection(databaseInfo).then(connection => {
      const serializer = newSerializer(databaseInfo.databaseId);
      const datastore = newDatastore(firestore._credentials, serializer);
      datastore.start(connection);
      return datastore;
    });
    datastoreInstances.set(firestore, datastorePromise);
  }
  return datastoreInstances.get(firestore)!;
}

/**
 * Removes all components associated with the provided instance. Must be called
 * when the Firestore instance is terminated.
 */
export async function removeComponents(firestore: Firestore): Promise<void> {
  const datastorePromise = await datastoreInstances.get(firestore);
  if (datastorePromise) {
    logDebug(LOG_TAG, 'Removing Datastore');
    datastoreInstances.delete(firestore);
    return (await datastorePromise).termiate();
  }
}