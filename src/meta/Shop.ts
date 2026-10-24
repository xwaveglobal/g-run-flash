/**
 * In-app purchases. Products + a provider interface; the default DemoStore only
 * shows a confirmation (no payment is taken) so every purchase path can be tried.
 * Wire a real store by implementing `Store` (Google Play Billing / StoreKit via a
 * Capacitor plugin, or a web checkout) — see README → In-app purchases.
 */
import type { Reward } from './Daily.ts';

export interface Product {
  sku: string;
  name: string;
  desc: string;
  price: string;
  /** what the player receives */
  grant: Reward & { noAds?: boolean; passDays?: number; starter?: boolean };
  badge?: string;
  kind: 'coins' | 'bundle' | 'special';
  /** one-time offer */
  once?: boolean;
  art: 'coins-s' | 'coins-m' | 'coins-l' | 'coins-xl' | 'starter' | 'jumps' | 'hyper' | 'noads' | 'pass' | 'escape';
}

/** v2: the shop sells only coins (+ Remove Ads). EXP can never be bought. */
export const PRODUCTS: Product[] = [
  { sku: 'coins_s', name: '1,000 coins', desc: 'A handful', price: '$0.99', grant: { coins: 1000 }, kind: 'coins', art: 'coins-s' },
  { sku: 'coins_m', name: '6,000 coins', desc: '+20% bonus', price: '$4.99', grant: { coins: 6000 }, badge: 'POPULAR', kind: 'coins', art: 'coins-m' },
  { sku: 'coins_l', name: '13,000 coins', desc: '+30% bonus', price: '$9.99', grant: { coins: 13000 }, kind: 'coins', art: 'coins-l' },
  { sku: 'coins_xl', name: '30,000 coins', desc: '+50% bonus', price: '$19.99', grant: { coins: 30000 }, badge: 'BEST VALUE', kind: 'coins', art: 'coins-xl' },
  { sku: 'no_ads', name: 'Remove Ads', desc: 'No ad after a race ends, forever. Revive ads stay optional.', price: '$2.99', grant: { noAds: true }, kind: 'special', once: true, art: 'noads' },
];

export const productBySku = (sku: string) => PRODUCTS.find((p) => p.sku === sku);

export interface Store {
  readonly name: string;
  /** resolves true when the store confirms the purchase */
  purchase(p: Product): Promise<boolean>;
}

/** Demo store: a clear "demo — no payment" confirmation sheet. */
export class DemoStore implements Store {
  readonly name = 'demo';
  constructor(private parent: HTMLElement) {}
  purchase(p: Product) {
    return new Promise<boolean>((resolve) => {
      const el = document.createElement('div');
      el.className = 'iapsheet';
      el.innerHTML = `
        <div class="iapsheet-box">
          <div class="admock-tag">DEMO STORE</div>
          <div class="iapsheet-name">${p.name}</div>
          <div class="iapsheet-desc">${p.desc}</div>
          <div class="iapsheet-price">${p.price}</div>
          <div class="iapsheet-note">Demo only — no payment is taken. A real build opens Google Play / App Store billing here.</div>
          <div class="admock-actions">
            <button class="btn ghost sm" data-x="no">Cancel</button>
            <button class="btn sm" data-x="ok">Confirm (demo)</button>
          </div>
        </div>`;
      this.parent.appendChild(el);
      const done = (ok: boolean) => {
        el.remove();
        resolve(ok);
      };
      el.querySelector('[data-x="ok"]')!.addEventListener('click', () => done(true));
      el.querySelector('[data-x="no"]')!.addEventListener('click', () => done(false));
      el.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    });
  }
}
