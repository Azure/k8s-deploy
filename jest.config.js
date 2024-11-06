module.exports = {
   moduleFileExtensions: ['js', 'ts'],
   testEnvironment: 'node',
   testMatch: ['**/*.test.ts'],
   transform: {
      "\\.[jt]sx?$": "babel-jest",
   },
   transformIgnorePatterns: [
    'node_modules/(?!' + 
        [
            '@octokit',
            'universal-user-agent',
            'before-after-hook',
            'minimist'
        ].join('|') +
    ')',
],
   verbose: true,
   testTimeout: 9000
}
