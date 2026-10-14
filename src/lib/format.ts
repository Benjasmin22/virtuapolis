export function money(cents:string):string {
  const n=BigInt(cents),m=n<0n?-n:n;
  return `${n<0n?"−":""}MQ ${(m/100n).toLocaleString("pt-BR")},${(m%100n).toString().padStart(2,"0")}`;
}
export function percent(bps:string):string {
  const n=BigInt(bps),m=n<0n?-n:n;
  return `${n<0n?"−":""}${(m/100n).toLocaleString("pt-BR")},${(m%100n).toString().padStart(2,"0")}%`;
}
