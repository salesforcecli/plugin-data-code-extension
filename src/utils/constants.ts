/*
 * Copyright 2026, Salesforce, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Script (data transform) `--use-in-feature` invoke options.
 *
 * Mirrors `SCRIPT_USE_IN_FEATURE_*` in the SDK's `datacustomcode/constants.py`.
 * `BatchTransform` (the default) is a bounded, batch data transform; `StreamingTransform`
 * is a streaming data transform over a DLO/DMO change feed.
 */
export const SCRIPT_USE_IN_FEATURE_BATCH = 'BatchTransform';
export const SCRIPT_USE_IN_FEATURE_STREAMING = 'StreamingTransform';
export const SCRIPT_USE_IN_FEATURE_OPTIONS: string[] = [SCRIPT_USE_IN_FEATURE_BATCH, SCRIPT_USE_IN_FEATURE_STREAMING];
