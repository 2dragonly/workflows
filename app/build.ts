import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'
import { deepmerge } from 'deepmerge-ts'
import * as electron from 'electron-builder'
import * as vite from 'vite'
import electronConfig from './electron.config'
import viteConfig from './vite.config'

const dirname = path.dirname(url.fileURLToPath(import.meta.url))
const paths = ['build', 'bundled'].map(x => path.join(dirname, 'dist', x))

const entry = {
  main: (viteConfig.build?.lib as any).entry,
  preload: (viteConfig.build?.rollupOptions as any)?.input,
}

async function run() {
  paths.forEach(
    p => fs.existsSync(p) && fs.rmSync(p, { recursive: true, force: true }),
  )
  paths.forEach(p => fs.mkdirSync(p, { recursive: true }))

  const mergedViteConfig = deepmerge(viteConfig, {
    build: {
      outDir: paths[0],
      rollupOptions: {
        input: Object.fromEntries(
          Object.entries(entry).filter(
            ([_, value]) => typeof value === 'string',
          ),
        ),
      },
    },
  })

  await vite.build(mergedViteConfig)
  await copyPackageJson()

  await electron.build({
    config: deepmerge(electronConfig, {
      directories: { output: paths[1], app: paths[0] },
      files: [path.join('.', '**', '*')],
      extends: null,
    }),
  })
}

async function copyPackageJson() {
  const packageJsonPath = path.join(dirname, 'package.json')
  const packageJson = JSON.parse(
    await fs.promises.readFile(packageJsonPath, 'utf-8'),
  )
  const modifiedPackageJson: Record<string, any> = {
    ...Object.fromEntries(
      [
        'name',
        'version',
        'description',
        'author',
        'homepage',
        'repository',
        'license',
      ].map(_ => [_, packageJson[_]]),
    ),
    main: './main.cjs',
    dependencies: {},
  }

  ;[viteConfig.build?.rollupOptions?.external]
    .flat()
    .filter(_ => typeof _ === 'string')
    .forEach(dep => {
      if (packageJson.dependencies?.[dep]) {
        modifiedPackageJson.dependencies[dep] = packageJson.dependencies[dep]
      }
    })

  await fs.promises.writeFile(
    path.join(paths[0], 'package.json'),
    JSON.stringify(modifiedPackageJson, null, 2),
    'utf-8',
  )
}

run()
