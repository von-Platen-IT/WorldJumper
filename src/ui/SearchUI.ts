import { FORMATS, type FormatKey } from '../config';
import type { CountryRegistry } from '../data/CountryRegistry';
import type { CountryIndexEntry } from '../data/types';
import { assetUrl } from '../utils/assets';

export type InputMode = 'single' | 'list';

export interface SearchUIOptions {
  registry: CountryRegistry;
  onSubmit: (countries: CountryIndexEntry[]) => void;
  onFormatChange: (format: FormatKey) => void;
  onFocusChange: (focused: boolean) => void;
  onSafeAreaToggle: (visible: boolean) => void;
}

/**
 * Plain HTML/CSS user interface. It never touches the camera or the globe – it
 * only resolves the user's selection and hands countries to the app controller.
 */
export class SearchUI {
  private readonly registry: CountryRegistry;
  private readonly options: SearchUIOptions;
  private readonly root: HTMLElement;

  private mode: InputMode = 'single';
  private hits: CountryIndexEntry[] = [];
  private highlighted = -1;
  private format: FormatKey = 'landscape';
  private safeArea = false;

  private input!: HTMLInputElement;
  private textarea!: HTMLTextAreaElement;
  private acList!: HTMLUListElement;
  private errorBox!: HTMLElement;

  constructor(root: HTMLElement, options: SearchUIOptions) {
    this.root = root;
    this.registry = options.registry;
    this.options = options;
    this.render();
    this.bind();
  }

  private render(): void {
    this.root.classList.add('ui');
    this.root.innerHTML = `
      <div class="panel">
        <div class="panel__brand">
          <span class="panel__dot"></span>
          <span>Globe Film Tool</span>
        </div>

        <div class="panel__modes" role="tablist">
          <button type="button" class="chip is-active" data-mode="single" role="tab">Einzelnes Land</button>
          <button type="button" class="chip" data-mode="list" role="tab">Länderliste</button>
        </div>

        <div class="panel__field" data-field="single">
          <div class="search">
            <input
              id="country-input"
              type="text"
              class="search__input"
              placeholder="Land eingeben …"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
            />
            <ul class="ac" id="ac" hidden></ul>
          </div>
        </div>

        <div class="panel__field" data-field="list" hidden>
          <textarea
            id="country-list"
            class="list-input"
            rows="6"
            placeholder="Deutschland&#10;Frankreich&#10;Spanien&#10;Japan"
            spellcheck="false"
          ></textarea>
          <button type="button" class="btn btn--primary" id="start-list">Sequenz starten</button>
        </div>

        <div class="panel__meta">
          <div class="formats" data-role="formats">
            <button type="button" class="chip is-active" data-format="landscape">16:9</button>
            <button type="button" class="chip" data-format="portrait">9:16</button>
          </div>
          <button type="button" class="chip" id="toggle-safe">Safe Area</button>
        </div>

        <p class="panel__error" id="ui-error" hidden></p>
        <p class="panel__hint">
          <kbd>Enter</kbd> startet die Sequenz · <kbd>Esc</kbd> oder <kbd>R</kbd> setzt zurück
        </p>
      </div>
    `;

    this.input = this.root.querySelector('#country-input')!;
    this.textarea = this.root.querySelector('#country-list')!;
    this.acList = this.root.querySelector('#ac')!;
    this.errorBox = this.root.querySelector('#ui-error')!;
  }

  private bind(): void {
    this.input.addEventListener('input', () => this.updateSuggestions());
    this.input.addEventListener('keydown', (event) => this.onInputKey(event));
    this.input.addEventListener('focus', () => this.options.onFocusChange(true));
    this.input.addEventListener('blur', () => {
      // Delay so a click on a suggestion still registers.
      window.setTimeout(() => this.options.onFocusChange(false), 120);
    });

    this.textarea.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        this.submitList();
      }
    });

    this.root.querySelector('#start-list')!.addEventListener('click', () => this.submitList());

    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-mode]')) {
      button.addEventListener('click', () => this.setMode(button.dataset.mode as InputMode));
    }

    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-format]')) {
      button.addEventListener('click', () => this.setFormat(button.dataset.format as FormatKey));
    }

    this.root.querySelector('#toggle-safe')!.addEventListener('click', (event) => {
      this.safeArea = !this.safeArea;
      (event.currentTarget as HTMLElement).classList.toggle('is-active', this.safeArea);
      this.options.onSafeAreaToggle(this.safeArea);
    });
  }

  setMode(mode: InputMode): void {
    this.mode = mode;
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-mode]')) {
      button.classList.toggle('is-active', button.dataset.mode === mode);
    }
    (this.root.querySelector('[data-field="single"]') as HTMLElement).hidden = mode !== 'single';
    (this.root.querySelector('[data-field="list"]') as HTMLElement).hidden = mode !== 'list';
    this.clearError();
    if (mode === 'single') this.input.focus();
    else this.textarea.focus();
  }

  setFormat(format: FormatKey): void {
    this.format = format;
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-format]')) {
      button.classList.toggle('is-active', button.dataset.format === format);
    }
    this.options.onFormatChange(format);
  }

  /** Hides the panel while a film sequence runs. Never steals focus. */
  setBusy(busy: boolean): void {
    this.root.classList.toggle('ui--hidden', busy);
  }

  focus(): void {
    if (this.mode === 'single') this.input.focus();
  }

  showError(message: string): void {
    this.errorBox.textContent = message;
    this.errorBox.hidden = false;
    this.root.classList.add('panel--shake');
    window.setTimeout(() => this.root.classList.remove('panel--shake'), 420);
  }

  clearError(): void {
    this.errorBox.hidden = true;
  }

  private updateSuggestions(): void {
    this.clearError();
    const query = this.input.value.trim();
    if (!query) {
      this.hits = [];
      this.highlighted = -1;
      this.renderSuggestions();
      return;
    }
    this.hits = this.registry.search(query, 8);
    this.highlighted = this.hits.length === 1 ? 0 : -1;
    this.renderSuggestions();
  }

  private renderSuggestions(): void {
    if (!this.hits.length) {
      this.acList.hidden = true;
      this.acList.innerHTML = '';
      return;
    }
    this.acList.hidden = false;
    this.acList.innerHTML = this.hits
      .map((entry, index) => {
        const flag = entry.flag
          ? `<img class="ac__flag" src="${assetUrl(entry.flag)}" alt="" />`
          : '<span class="ac__flag ac__flag--none"></span>';
        return `
          <li class="ac__item${index === this.highlighted ? ' is-active' : ''}" data-index="${index}">
            ${flag}
            <span class="ac__name">${entry.nameDe}</span>
            <span class="ac__code">${entry.iso3 ?? entry.id}</span>
          </li>`;
      })
      .join('');

    for (const item of this.acList.querySelectorAll<HTMLLIElement>('.ac__item')) {
      item.addEventListener('mousedown', (event) => {
        event.preventDefault();
        const index = Number(item.dataset.index);
        this.commit(this.hits[index]);
      });
    }
  }

  private onInputKey(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!this.hits.length) return;
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      this.highlighted = (this.highlighted + delta + this.hits.length) % this.hits.length;
      this.renderSuggestions();
      return;
    }
    if (event.key === 'Escape') {
      this.hits = [];
      this.highlighted = -1;
      this.renderSuggestions();
      return;
    }
    if (event.key !== 'Enter') return;
    event.preventDefault();

    if (this.highlighted >= 0 && this.hits[this.highlighted]) {
      this.commit(this.hits[this.highlighted]);
      return;
    }
    const query = this.input.value.trim();
    if (!query) return;

    if (this.hits.length === 1) {
      this.commit(this.hits[0]);
      return;
    }
    if (this.hits.length > 1) {
      // Ambiguous: keep the choice visible instead of picking something random.
      this.showError('Mehrere Treffer – bitte einen Vorschlag mit den Pfeiltasten wählen.');
      return;
    }
    const resolved = this.registry.resolve(query);
    if (resolved) this.commit(resolved);
    else this.showError(`Kein Land gefunden für „${query}“.`);
  }

  private commit(entry: CountryIndexEntry | undefined): void {
    if (!entry) return;
    this.hits = [];
    this.highlighted = -1;
    this.renderSuggestions();
    this.clearError();
    this.options.onSubmit([entry]);
  }

  private submitList(): void {
    const raw = this.textarea.value;
    const tokens = raw
      .split(/[\n,;]+/)
      .map((token) => token.trim())
      .filter(Boolean);

    if (!tokens.length) {
      this.showError('Bitte mindestens ein Land eingeben.');
      return;
    }

    const resolved: CountryIndexEntry[] = [];
    const missing: string[] = [];
    for (const token of tokens) {
      const entry = this.registry.resolve(token);
      if (entry) resolved.push(entry);
      else missing.push(token);
    }

    if (missing.length) {
      this.showError(`Nicht gefunden: ${missing.join(', ')}`);
      return;
    }
    this.clearError();
    this.options.onSubmit(resolved);
  }

  resetInputs(): void {
    this.input.value = '';
    this.textarea.value = '';
    this.hits = [];
    this.highlighted = -1;
    this.renderSuggestions();
    this.clearError();
  }

  formatLabel(): string {
    return FORMATS[this.format].label;
  }
}