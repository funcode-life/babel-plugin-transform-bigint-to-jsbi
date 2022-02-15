let n_b = 2n
let n_c = 3n
let n_d = BigInt('5')
let n_t = 4

const random = () => BigInt(Math.ceil(Math.random() * 1000)) + BigInt('10086')

console.log(n_b ** n_c)
console.log(n_b + n_c)
console.log(n_b / 3n)
console.log(n_b % 3n)
console.log(2n - 1n)
console.log(n_b -= 1n)
console.log(BigInt.asIntN(64, n_b))

if (random() < 10586n) {
  const parts = ["ff", "0", "0", "0", "0", "0", "0", "2"]
  console.log(parts.reduce((acc, p) => acc * 2n ** 16n + BigInt(parseInt(p, 16)), 0n))
}

if (true) {
  n_b = random()
  n_c = random()
  n_t = Math.random()

  const length = n_b - n_c + 1n
  console.log(length === 5n)
  console.log(n_t >= 0.5)
}
