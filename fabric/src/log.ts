// Sunucu tarafi hata gorunurlugu (2026-08-18, sessiz catch denetimi).
//
// Node'un console.error'i zaten fabric.log'a dusuyor (deploy-to-phone.sh:
// "node ... > $HOME/fabric.log 2>&1") - yani buraya yazilan HER SEY
// `ssh ... tail fabric.log` ile GORULEBILIR, bu oturumda defalarca
// kullanilan bir yol. Onceki sessiz catch bloklari bu gorunurlugu
// KULLANMIYORDU - hata gercekten oluyordu ama hicbir yere yazilmiyordu.
export function logErr(context: string, err: unknown) {
  console.error(`[fabric:${context}]`, err instanceof Error ? err.message : err);
}
