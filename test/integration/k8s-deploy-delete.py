import subprocess
import sys


def delete(kind, name, namespace):
    try:
        if (name == "all"):
            print('kubectl delete --all' + kind + ' -n ' + namespace)
            deletion = subprocess.Popen(
                ['kubectl', 'delete', kind, name, '--namespace', namespace])
            result, err = deletion.communicate()
        else:
            print('kubectl delete ' + kind + ' ' + name + ' -n ' + namespace)
            deletion = subprocess.Popen(
                ['kubectl', 'delete', kind, name, '--namespace', namespace])
            result, err = deletion.communicate()
    except Exception as ex:
        print('Error occured during deletion', ex)


def main():
    kind = sys.argv[1]
    name = sys.argv[2]
    namespace = 'test-' + sys.argv[3]
    delete(kind, name, namespace)


if __name__ == "__main__":
    sys.exit(main())
