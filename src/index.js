const syntaxBigInt = require('@babel/plugin-syntax-bigint').default;

const JSBI = 'JSBI';
const IMPORT_PATH = 'jsbi/dist/jsbi.mjs';
const ASSIGN_EXP = /[+\-*/]=/
const BINARY_FUNC_REPLACE = {
  // BinaryExpression
  '+': 'add',
  '-': 'subtract',
  '*': 'multiply',
  '/': 'divide',
  '%': 'remainder',
  '**': 'exponentiate',
  '<<': 'leftShift',
  '>>': 'signedRightShift',
  '&': 'bitwiseAnd',
  '|': 'bitwiseOr',
  '^': 'bitwiseXor',
  // RelationalExpression
  '<': 'lessThan',
  '>': 'greaterThan',
  '<=': 'lessThanOrEqual',
  '>=': 'greaterThanOrEqual',
  '===': 'equal',
  '!==': 'notEqual',
}

module.exports = function (babel) {
  const types = babel.types;

  const bigint_identifier = Symbol()

  const setBigIntSymbol = path => {
    const var_path = path.findParent(p => p.type === 'VariableDeclarator')
    if (var_path) var_path[bigint_identifier] = true
  }

  const isBigIntNode = (node, scope) => {
    if (!node) return

    if (node.type === 'BigIntLiteral') return true

    if (node.type === 'Identifier') {
      const bind = scope.getBinding(node.name)
      return bind && bind.path && bind.path[bigint_identifier]
    }

    if (node.type === 'CallExpression') {
      const { type, object, name } = node.callee

      // 静态方法调用
      if (type === 'MemberExpression') return object.name === 'BigInt'

      // 调用BigInt构造函数
      if (type === 'Identifier' && name === 'BigInt') return true
    }

    if (node.type === 'BinaryExpression') {
      return (isBigIntNode(node.left, scope) || isBigIntNode(node.right, scope))
        && (node.operator in BINARY_FUNC_REPLACE)
    }

    if (node.type === 'AssignmentExpression') {
      const operator = node.operator
      if (ASSIGN_EXP.test(operator)) {
        const binary_op = operator.replace('=', '')
        return isBigIntNode(node.right, scope) && (binary_op in BINARY_FUNC_REPLACE)
      }
    }
  }

  const visitor = {
    BigIntLiteral(path) {
      const value = path.node.value;
      path.replaceWith(types.callExpression(
        types.memberExpression(types.identifier(JSBI), types.identifier('BigInt')),
        [types.StringLiteral(value)]
      ));
      setBigIntSymbol(path)
    },
    CallExpression(path) {
      if (isBigIntNode(path.node, path.scope)) {
        const { type, object, property, name } = path.node.callee

        // 静态方法调用
        if (type === 'MemberExpression') {
          const callee_name = object.name
          const callee_property = property.name
          if (callee_name === 'BigInt') {
            path.replaceWith(types.callExpression(
              types.memberExpression(
                types.identifier(JSBI),
                types.identifier(callee_property)
              ),
              path.node.arguments
            ));
          }
        }

        // 调用BigInt构造函数
        else if (type === 'Identifier' && name === 'BigInt') {
          path.replaceWith(types.callExpression(
            types.memberExpression(
              types.identifier(JSBI),
              types.identifier('BigInt')
            ),
            path.node.arguments
          ));
        }
        // 保存标识符
        setBigIntSymbol(path)
      }
    },
    BinaryExpression(path) {
      if (isBigIntNode(path.node, path.scope)) {
        path.replaceWith(types.callExpression(
          types.memberExpression(
            types.identifier(JSBI),
            types.identifier(BINARY_FUNC_REPLACE[path.node.operator])
          ),
          [path.node.left, path.node.right]
        ));
        setBigIntSymbol(path)
      }
    },
    AssignmentExpression(path) {
      if (isBigIntNode(path.node, path.scope)) {
        // traverse children
        path.traverse(visitor)

        const operator = path.node.operator.replace('=', '')
        const right = types.callExpression(
          types.memberExpression(
            types.identifier(JSBI),
            types.identifier(BINARY_FUNC_REPLACE[operator])
          ),
          [path.node.left, path.node.right]
        )
        path.replaceWith(types.AssignmentExpression('=', path.node.left, right))

        setBigIntSymbol(path)
      }
    },
  }

  return {
    inherits: syntaxBigInt,
    visitor: {
      ...visitor,
      Program(path) {
        const identifier = types.identifier(JSBI);
        const importDefaultSpecifier = types.importDefaultSpecifier(identifier);
        const importDeclaration = types.importDeclaration([importDefaultSpecifier], types.stringLiteral(IMPORT_PATH));
        path.unshiftContainer('body', importDeclaration);
      }
    },
  };
};
