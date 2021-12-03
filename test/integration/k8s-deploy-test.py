import os, sys, json 

RESULT = 'false'
k8_object = None
kind = sys.argv[1]
name = sys.argv[2]
color = sys.argv[3]
namespace = 'test-' + sys.argv[4]

print('kubectl get '+kind+' '+name+' -n '+namespace+' -o json')

try:
  k8_object = json.load(os.popen('kubectl get '+kind+' '+name+' -n '+namespace+' -o json'))
except:
  sys.exit(kind+' '+name+' not created')

try:
  if kind == 'Deployment' and k8_object['spec']['selector']['matchLabels']['k8s.deploy.color'] == str(color):
    RESULT = 'true'
  if kind == 'Service' and k8_object['spec']['selector']['k8s.deploy.color'] == str(color):
    RESULT = 'true'
  if kind == 'Ingress':
    suffix = ''
    if str(color) == 'green':
      suffix = '-green'
    if k8_object['spec']['rules'][0]['http']['paths'][0]['backend']['serviceName']=='nginx-service'+suffix and k8_object['spec']['rules'][0]['http']['paths'][1]['backend']['serviceName']=='unrouted-service':
      RESULT = 'true'
except:
  pass    

if RESULT=='false':
  sys.exit(kind+' '+name+' not labelled properly')
print('Test passed')
