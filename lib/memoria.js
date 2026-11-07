// Guarda coisas pesadas na memória até um limite de bytes. Passou do limite, sai o que ninguém usa faz mais tempo.
// A hospedagem grátis tem 512 MB: imagem de membro não pode ficar acumulando pra sempre.
export class MemoriaLimitada {
  /** @type {Map<string, { valor: any, tamanho: number }>} */
  #itens = new Map();
  #total = 0;

  /**
   * @param {number} max bytes
   * @param {(valor: any) => number} medir tamanho de um valor
   */
  constructor(max, medir) {
    this.max = max;
    this.medir = medir;
  }

  ler(chave) {
    const item = this.#itens.get(chave);
    if (!item) return undefined;
    this.#itens.delete(chave);
    this.#itens.set(chave, item);
    return item.valor;
  }

  guardar(chave, valor) {
    this.tirar(chave);
    const tamanho = this.medir(valor);
    if (tamanho > this.max) return;
    this.#itens.set(chave, { valor, tamanho });
    this.#total += tamanho;
    while (this.#total > this.max) this.tirar(this.#itens.keys().next().value);
  }

  tirar(chave) {
    const item = this.#itens.get(chave);
    if (!item) return;
    this.#itens.delete(chave);
    this.#total -= item.tamanho;
  }
}
