import subprocess, sys

kind = sys.argv[1]
name = sys.argv[2]
namespace = 'test-' + sys.argv[3]

try:
  print('kubectl delete ' + kind + ' ' + name + ' -n ' + namespace)
  deletion = subprocess.Popen(['kubectl', 'delete', kind, name, '--namespace', namespace])
  result, err = deletion.communicate()
except Exception as ex:
  print('Error occured during deletion', ex)
