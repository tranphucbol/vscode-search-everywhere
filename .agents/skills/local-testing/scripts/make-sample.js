#!/usr/bin/env node
// Writes the "acme-shop" TypeScript workspace that the scenarios in reference/scenarios.md expect.
// Usage: node make-sample.js <dir> [--big [modules]] [--git]
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const DEFAULT_BIG_MODULES = 400;

const files = {
  "package.json": JSON.stringify({ name: "acme-shop", version: "1.0.0", private: true }, null, 2),
  "tsconfig.json": JSON.stringify(
    { compilerOptions: { target: "es2020", module: "commonjs", strict: true } },
    null,
    2
  ),
  ".gitignore": "src/generated/\n",
  "src/index.ts": `import { HTTPServer } from "./http/HTTPServer";
import { UserController } from "./controllers/UserController";
import { UserServiceImpl } from "./services/UserServiceImpl";

const server = new HTTPServer(8080);
server.register(new UserController(new UserServiceImpl()));
server.start();
`,
  "src/config/constants.ts": `export const MAX_VALUE = 1000;
export const DEFAULT_TIMEOUT = 30_000;
export const API_PREFIX = "/api/v1";
export const MAX_RETRIES = 3;
`,
  "src/models/User.ts": `export class User {
  constructor(
    public readonly id: string,
    public name: string,
    public email: string
  ) {}

  static find(id: string): User | undefined {
    return undefined;
  }

  save(): void {}

  rename(name: string): void {
    this.name = name;
  }
}
`,
  "src/models/Order.ts": `import { User } from "./User";

export enum OrderStatus {
  Pending,
  Paid,
  Shipped,
  Cancelled,
}

export class Order {
  status = OrderStatus.Pending;

  constructor(public readonly id: string, public readonly owner: User, public total: number) {}

  pay(): void {
    this.status = OrderStatus.Paid;
  }

  cancel(): void {
    this.status = OrderStatus.Cancelled;
  }
}
`,
  "src/models/Product.ts": `export interface Product {
  sku: string;
  title: string;
  price: number;
}

export function formatPrice(product: Product): string {
  return product.price.toFixed(2);
}
`,
  "src/services/UserService.ts": `import { User } from "../models/User";

export interface UserService {
  findById(id: string): Promise<User | undefined>;
  save(user: User): Promise<void>;
  remove(id: string): Promise<void>;
}
`,
  "src/services/UserServiceImpl.ts": `import { User } from "../models/User";
import { UserService } from "./UserService";
import { MAX_RETRIES } from "../config/constants";

export class UserServiceImpl implements UserService {
  private readonly users = new Map<string, User>();

  async findById(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async save(user: User): Promise<void> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      this.users.set(user.id, user);
      return;
    }
  }

  async remove(id: string): Promise<void> {
    this.users.delete(id);
  }
}
`,
  "src/services/OrderService.ts": `import { Order } from "../models/Order";

export class OrderService {
  private readonly orders: Order[] = [];

  place(order: Order): void {
    this.orders.push(order);
  }

  findByOwner(ownerId: string): Order[] {
    return this.orders.filter((order) => order.owner.id === ownerId);
  }

  totalRevenue(): number {
    return this.orders.reduce((sum, order) => sum + order.total, 0);
  }
}
`,
  "src/controllers/UserController.ts": `import { UserService } from "../services/UserService";

export class UserController {
  constructor(private readonly users: UserService) {}

  async getUser(id: string) {
    return this.users.findById(id);
  }

  async deleteUser(id: string) {
    await this.users.remove(id);
  }
}
`,
  "src/controllers/OrderController.ts": `import { OrderService } from "../services/OrderService";

export class OrderController {
  constructor(private readonly orders: OrderService) {}

  listOrders(ownerId: string) {
    return this.orders.findByOwner(ownerId);
  }
}
`,
  "src/http/HTTPServer.ts": `import { DEFAULT_TIMEOUT } from "../config/constants";

export class HTTPServer {
  private readonly controllers: unknown[] = [];

  constructor(private readonly port: number) {}

  register(controller: unknown): void {
    this.controllers.push(controller);
  }

  start(): void {
    setTimeout(() => undefined, DEFAULT_TIMEOUT);
  }

  stop(): void {}
}
`,
  "src/http/middleware.ts": `export let requestCount = 0;

export function logRequest(path: string): void {
  requestCount++;
  console.log(path);
}

export function requireAuth(token: string | undefined): boolean {
  return Boolean(token);
}
`,
  "src/utils/strings.ts": `export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function slugify(value: string): string {
  return value.toLowerCase().replace(/\\s+/g, "-");
}

export const EMPTY_STRING = "";
`,
  "src/utils/dates.ts": `export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}
`,
  "src/admin/index.ts": `export function bootstrapAdmin(): void {}
`,
  "src/billing/index.ts": `export function bootstrapBilling(): void {}
`,
  "src/generated/Schema.ts": `export interface GeneratedSchema {
  version: number;
}
`,
};

const domains = [
  "Inventory",
  "Shipping",
  "Payment",
  "Invoice",
  "Catalog",
  "Review",
  "Coupon",
  "Cart",
  "Warehouse",
  "Supplier",
];

function moduleFiles(count) {
  const result = {};
  for (let i = 0; i < count; i++) {
    const name = `${domains[i % domains.length]}${Math.floor(i / domains.length) + 1}`;
    result[`src/modules/${name.toLowerCase()}/${name}Service.ts`] = `export class ${name}Service {
  find(id: string) { return id; }
  save(value: string) { return value; }
  remove(id: string) { return id; }
}

export function create${name}(): ${name}Service {
  return new ${name}Service();
}
`;
  }
  return result;
}

function writeSample(root, { modules = 0 } = {}) {
  const all = { ...files, ...moduleFiles(modules) };
  for (const [rel, content] of Object.entries(all)) {
    const target = path.join(root, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  return Object.keys(all).length;
}

// Commits the sample and adds a sibling worktree, so the shared worktree cache has a
// repository fingerprint to key on. Returns the worktree path.
function initGit(root) {
  const git = (...args) =>
    execFileSync("git", ["-c", "user.name=sample", "-c", "user.email=sample@example.com", ...args], {
      cwd: root,
      stdio: "pipe",
    });
  const worktree = `${root}-wt`;
  git("init", "-q");
  git("add", "-A");
  git("commit", "-qm", "sample");
  git("worktree", "add", "-q", worktree);
  return worktree;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const root = args.find((arg) => !arg.startsWith("--") && !/^\d+$/.test(arg));
  if (!root) {
    console.error("usage: node make-sample.js <dir> [--big [modules]] [--git]");
    process.exit(1);
  }
  const bigIndex = args.indexOf("--big");
  const modules =
    bigIndex === -1 ? 0 : Number(/^\d+$/.test(args[bigIndex + 1] || "") ? args[bigIndex + 1] : DEFAULT_BIG_MODULES);
  const count = writeSample(path.resolve(root), { modules });
  console.log(`wrote ${count} files to ${path.resolve(root)}`);
  if (args.includes("--git")) {
    console.log(`git repository with worktree ${initGit(path.resolve(root))}`);
  }
}

module.exports = { writeSample, initGit, DEFAULT_BIG_MODULES };
