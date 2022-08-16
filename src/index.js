const syntaxBigInt = require('@babel/plugin-syntax-bigint').default;

const JSBI = 'JSBI';
const IMPORT_PATH = 'jsbi/dist/jsbi.mjs';
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
const MATH_FUNC_REPLACE = {
  pow: 'exponentiate'
}
const PROCESSED_SYMBOL = '__TRANSFORM_BIGINT_TO_JSBI__'
const isProcessed = (node, scope) => {
  if (!node || ! scope) return false
  if (node.type === 'Identifier') {
    const binding = scope.getBinding(node.name)
    return binding && binding.path && binding.path[PROCESSED_SYMBOL]
  }
  return node[PROCESSED_SYMBOL]
}

module.exports = function (babel) {
  const types = babel.types;

  const visitor = {
    // BigInt 字面量对象，需要 @babel/plugin-syntax-bigint 支持
    BigIntLiteral(path) {
      const value = path.node.value;
      // 调用 JSBI.BigInt 方法
      path.replaceWith(types.callExpression(
        types.memberExpression(
          types.identifier(JSBI),
          types.identifier('BigInt')
        ),
        [types.StringLiteral(value)]
      ));
      // 标记已处理
      path.node[PROCESSED_SYMBOL] = true
    },
    // 赋值操作
    VariableDeclarator: {
      exit(path) {
        // 如果赋值 init 是已处理过的，则变量自身也需要打上标记
        if (path.node.init && path.node.init[PROCESSED_SYMBOL]) {
          path[PROCESSED_SYMBOL] = true
        }
      }
    },
    // 调用表达式
    CallExpression: {
      enter(path) {
        // 因为主要是转换成 JSBI 方法，故此处需要判断，防止重复执行
        if (path.node[PROCESSED_SYMBOL]) return

        const callee_type = path.node.callee.type

        // 转换 BigInt 构造函数
        if (callee_type === 'Identifier') {
          const callee_name = path.node.callee.name
          if (callee_name === 'BigInt') {
            path.replaceWith(types.callExpression(
              types.memberExpression(
                types.identifier(JSBI),
                types.identifier(callee_name)
              ),
              path.node.arguments
            ));
            // 标记已处理
            path.node[PROCESSED_SYMBOL] = true
          }
        }

        // 对象方法调用
        else if (callee_type === 'MemberExpression') {
          // 如果是调用 JSBI 方法，则打上已处理 tag
          const object_name = path.node.callee.object.name
          if (object_name === JSBI) {
            path.node[PROCESSED_SYMBOL] = true
          }
          // 如果调用 BigInt 方法，则替换成 JSBI
          else if (object_name === 'BigInt') {
            const property = path.node.callee.property.name
            path.replaceWith(types.callExpression(
              types.memberExpression(
                types.identifier(JSBI),
                types.identifier(property)
              ),
              path.node.arguments
            ));
            // 标记已处理
            path.node[PROCESSED_SYMBOL] = true
          }
        }
      },
      exit(path) {
        // 理由同上
        if (path.node[PROCESSED_SYMBOL]) return

        const callee_type = path.node.callee.type

        // 如果调用参数存在 JSBI，则所有参数全部用 JSBI 包裹
        if (callee_type === 'MemberExpression') {
          const args = path.node.arguments

          const has_jsbi = args.some(n => isProcessed(n, path.scope))
          if (!has_jsbi) return

          // 如果调用的是 Math 的方法，则替换成 JSBI 方法
          const callee_object = path.node.callee.object.name
          const property_name = path.node.callee.property.name
          const is_math = callee_object === 'Math'
          path.replaceWith(types.callExpression(
            types.memberExpression(
              types.identifier(is_math ? JSBI : callee_object),
              types.identifier(is_math ? MATH_FUNC_REPLACE[property_name] || property_name : property_name)
            ),
            args
          ));
          // 标记已处理
          path.node[PROCESSED_SYMBOL] = true
        }
      }
    },
    BinaryExpression: {
      exit(path) {
        // 如果二元表达式任意一侧存在已处理标识，则此操作符替换成 JSBI 的方法
        // 同时两侧操作数也要替换成 JSBI 实例
        const { left, right } = path.node
        const is_processed = [left, right].some(n => isProcessed(n, path.scope))
        if (is_processed) {
          path.replaceWith(types.callExpression(
            types.memberExpression(
              types.identifier(JSBI),
              types.identifier(BINARY_FUNC_REPLACE[path.node.operator])
            ),
            [left, right]
          ));
          // 标记已处理
          path.node[PROCESSED_SYMBOL] = true
        }
      }
    },
    AssignmentExpression: {
      exit(path) {
        // 如果右侧标记已处理，则需要将此赋值操作用 JSBI 包裹
        const { right } = path.node
        const is_processed = isProcessed(right, path.scope)
        if (is_processed) {
          const operator = path.node.operator.replace('=', '')
          if (operator in BINARY_FUNC_REPLACE) {
            const new_right = types.callExpression(
              types.memberExpression(
                types.identifier(JSBI),
                types.identifier(BINARY_FUNC_REPLACE[operator])
              ),
              [path.node.left, right]
            )
            new_right[PROCESSED_SYMBOL] = true
            path.replaceWith(types.AssignmentExpression('=', path.node.left, new_right))
          }
          path.node[PROCESSED_SYMBOL] = true
        }
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
