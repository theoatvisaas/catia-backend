module.exports = {
    env: { node: true, es2022: true },
    parserOptions: { ecmaVersion: 2022, sourceType: "module" },
    plugins: ["prettier"],
    extends: ["eslint:recommended", "prettier"],
    rules: {
        "prettier/prettier": "error"
    }
};
