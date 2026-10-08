// Vitest setup: its workers end without an exit event, so each test file removes its temp folders itself
import { afterAll } from "vitest";

import { removeTemps } from "./fixture";

afterAll(removeTemps);
